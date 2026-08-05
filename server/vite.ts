import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // 캐시 규칙.
  // 기본값이 max-age=0 이라 브라우저가 매번 서버에 다시 물어봤다. 그래서 index.html 에서
  // 미리 받아둔 배경 이미지도 화면에 붙는 순간 또 받았다(2026-08-05 실측: academy-bg 가
  // 167ms 에 이미 다 받아졌는데 1624ms 에 재요청, namestory-bg 는 재요청이 17초 걸림).
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        // 화면 껍데기. 여기가 캐시되면 배포해도 옛 화면이 남는다.
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }
        // 빌드 산출물은 파일 이름에 내용 해시가 붙는다. 내용이 바뀌면 이름이 바뀌므로 영구 보관해도 안전하다.
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        // 이미지 등 이름이 고정된 파일. 한 번 방문하는 동안은 다시 안 받게 하되,
        // 배경을 교체하면 오래 안 기다리게 5분으로 짧게 잡는다.
        // stale-while-revalidate: 5분이 지나도 일단 있는 걸 바로 보여주고 갱신은 뒤에서 한다.
        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=604800");
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
