import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;
}
