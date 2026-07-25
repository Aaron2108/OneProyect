import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Mensaje que un miembro del equipo humano envía manualmente al cliente. */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}
