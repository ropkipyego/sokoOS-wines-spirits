import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  const config = app.get(ConfigService);
  const isProd = config.get<string>("NODE_ENV") === "production";

  if (isProd) {
    const accessSecret = config.get<string>("JWT_ACCESS_SECRET", "");
    const refreshSecret = config.get<string>("JWT_REFRESH_SECRET", "");
    if (
      accessSecret.length < 32 ||
      refreshSecret.length < 32 ||
      accessSecret.includes("change-me") ||
      refreshSecret.includes("change-me")
    ) {
      throw new Error(
        "FATAL: Production startup requires strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (>= 32 chars).",
      );
    }
  }

  const corsOrigins = config
    .get<string>("CORS_ORIGINS", "http://localhost:5175,http://localhost:5174")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  });

  // Support single-origin `/api/v1/*` and `/api/health/*` alongside `/v1/*` and `/health/*`
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url === "/api/v1" || req.url.startsWith("/api/v1/") || req.url.startsWith("/api/v1?")) {
      req.url = req.url.slice(4);
    } else if (
      req.url === "/api/health" ||
      req.url.startsWith("/api/health/") ||
      req.url.startsWith("/api/health?")
    ) {
      req.url = req.url.slice(4);
    }
    next();
  });

  app.setGlobalPrefix("v1", {
    exclude: [
      { path: "health", method: RequestMethod.ALL },
      { path: "health/live", method: RequestMethod.ALL },
      { path: "health/ready", method: RequestMethod.ALL },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const host = config.get<string>("API_HOST", "0.0.0.0");
  const port = Number(process.env.PORT ?? config.get("API_PORT") ?? 3001);

  await app.listen(port, host);
  Logger.log(`SokoOS Wines & Spirits API listening on http://${host}:${port}`, "Bootstrap");
  Logger.log(`REST mounted at /api/v1 and /v1 — health at /health/live|/health/ready`, "Bootstrap");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
