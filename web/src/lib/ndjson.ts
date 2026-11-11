/**
 * Lee una respuesta de "una línea JSON por mensaje" que llega en pedazos de cualquier tamaño (la búsqueda en dos
 * tandas). Cada línea completa se entrega a `onValue`; lo que queda a medias espera al siguiente pedazo.
 */
export function lineSplitter(onValue: (value: unknown) => void) {
  let buffer = '';
  const flush = (line: string) => {
    if (line.trim()) onValue(JSON.parse(line));
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let at = buffer.indexOf('\n');
      while (at >= 0) {
        flush(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        at = buffer.indexOf('\n');
      }
    },
    end() {
      flush(buffer);
      buffer = '';
    },
  };
}
