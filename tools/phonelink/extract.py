# Windows '휴대폰과 연결'(Phone Link) DB 복사본에서 문자(SMS·MMS 글자)를 꺼내 JSON 으로 저장한다(읽기만).
# 사용: py -3 extract.py <phone.db 복사본> <출력.json>
import sqlite3, sys, json

db, out_path = sys.argv[1], sys.argv[2]
c = sqlite3.connect(db)


def ts(v):
    v = int(v or 0)
    if v > 10**17:
        return int((v - 116444736000000000) / 10**4)  # Windows FILETIME → ms
    if v > 10**12:
        return v  # 이미 ms
    return v * 1000


out = []
for mid, typ, fa, ta, body, t in c.execute(
    "select message_id, type, from_address, to_address, body, timestamp from message"
):
    out.append({"kind": "sms", "id": int(mid), "type": typ, "from": fa or "", "to": ta or "", "body": body or "", "ms": ts(t)})

# MMS: 글자 부분만(사진은 저장하지 않는다 — 원장님 결정)
for mid, typ, fa, ta, t, txt in c.execute(
    "select m.message_id, m.type, m.from_address, m.to_addresses, m.timestamp, group_concat(p.text, ' ') "
    "from mms m left join mms_part p on p.message_id = m.message_id and p.content_type like 'text/plain%' "
    "group by m.message_id"
):
    out.append({"kind": "mms", "id": int(mid), "type": typ, "from": fa or "", "to": ta or "", "body": (txt or "").strip(), "ms": ts(t)})

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(len(out))
