# 프로덕션 이미지 — ffmpeg 포함 (인스타 H.264 변환 / 유튜브 썸네일 프레임 추출)
FROM node:22-bookworm-slim

# ffmpeg를 표준 경로(/usr/bin)에 설치 → spawn("ffmpeg")가 확실히 찾음
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 설치 (빌드에 vite/esbuild 등 devDependencies 필요 → --include=dev)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# 소스 전체 복사 후 빌드 (vite build → dist/public, esbuild → dist/index.js)
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Railway가 PORT 주입 → 서버는 process.env.PORT 사용
CMD ["node", "dist/index.js"]
