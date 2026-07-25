import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Nota interna del equipo sobre una conversación (no se envía al cliente). */
export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
