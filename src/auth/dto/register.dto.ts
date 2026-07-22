import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de una empresa (tenant) y su usuario propietario. */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  tenantName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
