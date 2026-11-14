import { BadRequestException } from "@nestjs/common";

export const MIN_PASSWORD_LENGTH = 10;

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Password must include at least one letter and one number",
    });
  }
}
