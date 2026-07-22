import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password!: string;
}
