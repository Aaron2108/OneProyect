import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateQuickReplyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
