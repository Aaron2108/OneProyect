import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Un turno del chat de prueba. */
export class TestChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(2000)
  text!: string;
}

/**
 * Historial completo del chat de prueba: lo mantiene el panel y lo reenvía en
 * cada turno, igual que el worker de WhatsApp reenvía los últimos mensajes de la
 * conversación. El tope existe porque cada turno se paga en el system prompt.
 */
export class TestChatDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TestChatTurnDto)
  messages!: TestChatTurnDto[];
}
