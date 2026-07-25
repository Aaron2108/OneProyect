import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Segundo paso del alta con Google: falta el nombre de la empresa (Google no lo sabe). */
export class CompleteGoogleSignupDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tenantName!: string;
}
