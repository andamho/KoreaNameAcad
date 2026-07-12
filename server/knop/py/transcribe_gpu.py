# KNOP 통화 전사 (GPU): faster-whisper large-v3 CUDA + 무음 청킹 + 단어 타임스탬프
# WhisperX 정렬 없이 faster-whisper 자체 word_timestamps 사용(통화는 텍스트가 목적).
# 출력: words.json = {"text": ..., "words": [{"word","start","end"}]}  (correct.py 호환)
# 사용: python transcribe_gpu.py <audio.wav> <words.json> [model] [device] [compute]
import json, sys, io, re, subprocess, wave, os


# Windows: nvidia CUDA DLL(cublas/cudnn/nvrtc) 검색경로 등록 (venv pip 설치본)
def _add_cuda_dlls():
    if os.name != "nt":
        return
    try:
        import nvidia  # namespace package → __file__ 은 None, __path__ 사용
        added = []
        for base in list(getattr(nvidia, "__path__", [])):
            for sub in ("cublas", "cudnn", "cuda_nvrtc", "cuda_runtime"):
                p = os.path.join(base, sub, "bin")
                if os.path.isdir(p):
                    os.add_dll_directory(p)
                    # CTranslate2 는 add_dll_directory 를 안 쓰고 PATH 를 검색 → PATH 에도 추가
                    os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")
                    added.append(sub)
        if added:
            print("[TR-GPU] CUDA DLL 등록:", ",".join(added), file=sys.stderr)
    except Exception as e:
        print("[TR-GPU] CUDA DLL 경로 등록 경고:", e, file=sys.stderr)


_add_cuda_dlls()
from faster_whisper import WhisperModel

SIL_DB = "-35dB"     # 이보다 조용하면 무음(조각 경계)
MIN_SIL = 0.7        # 이 이상 무음이면 조각 나눔(테이크 사이만)
PAD = 0.2            # 조각 앞뒤 여유
MAX_LEN = 30.0       # 조각 최대 길이(GPU라 넉넉히)
CLIP = os.path.join("output", "_chunk_gpu.wav")


def audio_dur(wav):
    with wave.open(wav) as w:
        return w.getnframes() / w.getframerate()


def silence_intervals(wav, noise, d):
    out = subprocess.run(
        ["ffmpeg", "-i", wav, "-af", f"silencedetect=noise={noise}:d={d}", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    sils, st = [], None
    for m in re.finditer(r"silence_(start|end): ([0-9.]+)", out):
        if m.group(1) == "start":
            st = float(m.group(2))
        elif st is not None:
            sils.append((st, float(m.group(2)))); st = None
    return sils


def speech_chunks(wav):
    """무음 기준 말 덩어리 구간(각각 독립 전사 → 긴 통화 반복 뭉갬 방지)."""
    dur = audio_dur(wav)
    sils = silence_intervals(wav, SIL_DB, MIN_SIL)
    chunks, pos = [], 0.0
    for a, b in sils:
        if a - pos > 0.25:
            chunks.append([pos, a])
        pos = b
    if dur - pos > 0.25:
        chunks.append([pos, dur])
    out = []
    for s, e in chunks:
        s, e = max(0, s - PAD), min(dur, e + PAD)
        while e - s > MAX_LEN:
            out.append([round(s, 3), round(s + MAX_LEN, 3)]); s += MAX_LEN
        out.append([round(s, 3), round(e, 3)])
    return out or [[0.0, dur]]


def _assign_speakers(wav, words, o):
    """pyannote 화자구분 → 각 단어에 speaker 라벨. HUGGINGFACE_TOKEN 있을 때만.
    없거나 실패하면 그대로 반환(음성연동 편집기는 화자 없이도 동작)."""
    token = os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN")
    if not token or not words:
        return words
    try:
        # pyannote 4.x 는 내부 중첩 다운로드(community-1 등)에 token 인자를 안 넘김
        # → huggingface_hub 전역 토큰 환경변수로 설정해 모든 다운로드에 적용
        os.environ["HF_TOKEN"] = token
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token
        from pyannote.audio import Pipeline
        import torch
        # pyannote/huggingface_hub 버전에 따라 인자명이 다름(token vs use_auth_token)
        try:
            pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", token=token)
        except TypeError:
            pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
        try:
            if torch.cuda.is_available():
                pipe.to(torch.device("cuda"))
        except Exception:
            pass
        o.write("[TR-GPU] 화자구분(pyannote) 실행...\n"); o.flush()
        # torchcodec 미설치 우회: 표준 wave 모듈로 PCM wav 직접 로드 → waveform 전달
        audio_in = wav
        try:
            import wave as _wave
            import numpy as np
            with _wave.open(wav, "rb") as _wf:
                sr = _wf.getframerate()
                ch = _wf.getnchannels()
                raw = _wf.readframes(_wf.getnframes())
            arr = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
            if ch > 1:
                arr = arr.reshape(-1, ch).mean(axis=1)
            audio_in = {"waveform": torch.from_numpy(np.ascontiguousarray(arr)).unsqueeze(0), "sample_rate": sr}
        except Exception as _ae:
            o.write(f"[TR-GPU] waveform 로드 실패({str(_ae)[:80]}) → 파일경로로 시도\n"); o.flush()
        # 상담 통화는 보통 2명 → 과분할 방지 위해 화자 수 제한(env로 조정 가능)
        maxspk = int(os.environ.get("KNOP_DIAR_MAX_SPEAKERS", "2"))
        try:
            dia = pipe(audio_in, min_speakers=1, max_speakers=maxspk)
        except TypeError:
            dia = pipe(audio_in)
        # pyannote 4.x: DiarizeOutput(.exclusive_speaker_diarization). 3.x: Annotation 직접.
        ann = (
            getattr(dia, "exclusive_speaker_diarization", None)
            or getattr(dia, "speaker_diarization", None)
            or dia
        )
        turns = sorted((t.start, t.end, spk) for t, _, spk in ann.itertracks(yield_label=True))
        for w in words:
            mid = (w["start"] + w["end"]) / 2
            spk = next((lbl for s, e, lbl in turns if s <= mid <= e), None)
            if spk is None and turns:
                spk = min(turns, key=lambda t: 0 if t[0] <= mid <= t[1] else min(abs(mid - t[0]), abs(mid - t[1])))[2]
            w["speaker"] = spk
        n_spk = len(set(w.get("speaker") for w in words if w.get("speaker")))
        o.write(f"[TR-GPU] 화자 {n_spk}명 구분 완료\n"); o.flush()
    except Exception as e:
        o.write(f"[TR-GPU] 화자구분 생략: {str(e)[:150]}\n"); o.flush()
    return words


# 순차(조각별) 전사 — 배치 실패/CPU 시 폴백. 기존 검증된 방식.
def _seq_transcribe(m, wav, o, beam):
    chunks = speech_chunks(wav)
    o.write(f"[TR-GPU] (순차) 조각 {len(chunks)}개 전사 beam={beam}...\n"); o.flush()
    words, segments = [], []
    for ci, (s, e) in enumerate(chunks):
        subprocess.run(["ffmpeg", "-y", "-ss", str(s), "-t", str(e - s), "-i", wav, CLIP],
                       capture_output=True)
        segs, _ = m.transcribe(CLIP, language="ko", vad_filter=False, beam_size=beam,
                               condition_on_previous_text=False, no_speech_threshold=0.6,
                               word_timestamps=True)
        for seg in segs:
            txt = (seg.text or "").strip()
            if txt:
                segments.append({"start": seg.start + s, "end": seg.end + s, "text": txt})
            for w in (seg.words or []):
                ww = (w.word or "").strip()
                if ww:
                    words.append({"word": ww, "start": round(w.start + s, 3), "end": round(w.end + s, 3)})
        if (ci + 1) % 20 == 0:
            o.write(f"[TR-GPU] {ci + 1}/{len(chunks)} 조각 처리\n"); o.flush()
    return words, segments


# 배치 추론 — VAD로 창 분할 후 GPU 병렬. 실시간 대비 여러 배. 전체 오디오 한 번에(오프셋 불필요).
def _batched_transcribe(m, wav, o, beam, batch):
    from faster_whisper import BatchedInferencePipeline
    bp = BatchedInferencePipeline(model=m)
    o.write(f"[TR-GPU] (배치 batch_size={batch}, beam={beam}) 전사...\n"); o.flush()
    segs, _ = bp.transcribe(wav, language="ko", batch_size=batch, beam_size=beam,
                            word_timestamps=True, vad_filter=True, no_speech_threshold=0.6,
                            condition_on_previous_text=False)
    words, segments = [], []
    for seg in segs:
        txt = (seg.text or "").strip()
        if txt:
            segments.append({"start": seg.start, "end": seg.end, "text": txt})
        for w in (seg.words or []):
            ww = (w.word or "").strip()
            if ww:
                words.append({"word": ww, "start": round(w.start, 3), "end": round(w.end, 3)})
    return words, segments


def run(wav, out, model_size="large-v3", device="cuda", compute="float16"):
    o = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    try:
        m = WhisperModel(model_size, device=device, compute_type=compute)
    except Exception as e:
        # GPU 실패 시 CPU 폴백
        o.write(f"[TR-GPU] {device} 실패({str(e)[:120]}) → CPU 폴백\n"); o.flush()
        m = WhisperModel(model_size, device="cpu", compute_type="int8")
        device = "cpu"

    beam = int(os.environ.get("KNOP_WHISPER_BEAM", "1"))
    batch = int(os.environ.get("KNOP_WHISPER_BATCH", "8"))
    o.write(f"[TR-GPU] device={device}\n"); o.flush()
    words, segments = [], []
    # GPU면 배치 우선(빠름). 실패/빈 결과면 순차로 폴백(안전 — 큐 안 깨짐).
    if device != "cpu" and os.environ.get("KNOP_WHISPER_BATCHED", "1") == "1":
        try:
            words, segments = _batched_transcribe(m, wav, o, beam, batch)
        except Exception as e:
            o.write(f"[TR-GPU] 배치 실패({str(e)[:150]}) → 순차 폴백\n"); o.flush()
            words, segments = [], []
    if not words:
        words, segments = _seq_transcribe(m, wav, o, beam if beam >= 1 else 5)

    words.sort(key=lambda x: x["start"])
    segments.sort(key=lambda x: x["start"])
    words = _assign_speakers(wav, words, o)
    json.dump({"text": " ".join(w["word"] for w in words), "words": words, "segments": segments},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    o.write(f"[TR-GPU] 완료: 단어 {len(words)}개 → {out}\n"); o.flush()


if __name__ == "__main__":
    wav = sys.argv[1] if len(sys.argv) > 1 else "output/audio.wav"
    out = sys.argv[2] if len(sys.argv) > 2 else "output/words.json"
    size = sys.argv[3] if len(sys.argv) > 3 else "large-v3"
    dev = sys.argv[4] if len(sys.argv) > 4 else os.environ.get("KNOP_WHISPER_DEVICE", "cuda")
    comp = sys.argv[5] if len(sys.argv) > 5 else os.environ.get("KNOP_WHISPER_COMPUTE", "float16")
    run(wav, out, size, dev, comp)
