/**
 * SoundService - Gerenciamento de Áudio da Aplicação
 *
 * NOTA DE UX: O efeito sonoro de inicialização e checkpoints foi desativado
 * por determinação do Diretor de Projeto para garantir discrição em locais públicos.
 * Os métodos permanecem como stubs silenciosos para compatibilidade.
 */

class SoundService {
  public playCheckpointReveal(): void {
    // Modo 100% silencioso: nenhum áudio reproduzido
  }
}

export const soundService = new SoundService();
