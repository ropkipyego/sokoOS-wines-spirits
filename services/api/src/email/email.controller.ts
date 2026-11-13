import {
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Public } from "../common/decorators/permissions.decorator";
import { InvitationsService } from "./invitations.service";

class AcceptInviteDto {
  @IsString() @MinLength(16) token!: string;
  @IsString() @MinLength(10) password!: string;
  @IsOptional() @IsString() name?: string;
}

class ResetRequestDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() tenantSlug?: string;
}

class ResetCompleteDto {
  @IsString() @MinLength(16) token!: string;
  @IsString() @MinLength(10) password!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmailController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @Post("public/invitations/accept")
  accept(@Body() body: AcceptInviteDto) {
    return this.invitations
      .acceptInvitation(body.token, body.password, body.name)
      .then((data) => ({ data }));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post("public/password-reset/request")
  resetRequest(@Body() body: ResetRequestDto) {
    return this.invitations
      .requestPasswordReset(body.email, body.tenantSlug)
      .then((data) => ({ data }));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post("public/password-reset/complete")
  resetComplete(@Body() body: ResetCompleteDto) {
    return this.invitations
      .completePasswordReset(body.token, body.password)
      .then((data) => ({ data }));
  }
}
