/** Génère un identifiant unique (timestamp + suffixe aléatoire). */
export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
