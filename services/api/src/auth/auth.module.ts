import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>("NODE_ENV", "development");
        const secret = config.get<string>(
          "JWT_ACCESS_SECRET",
          "change-me-access-secret-min-32-chars",
        );
        if (
          nodeEnv === "production" &&
          (!secret || secret.length < 32 || secret.includes("change-me"))
        ) {
          throw new Error(
            "FATAL: Production requires a strong JWT_ACCESS_SECRET (>= 32 chars).",
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>("JWT_ACCESS_TTL", "15m") as `${number}m`,
          },
        };
      },
    }),
    RolesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
