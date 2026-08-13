type Listener = (token: string | null) => void;

let currentToken: string | null = null;
// Ditambah setiap kali setAccessToken dipanggil (oleh login/register/logout
// ATAU oleh refreshAccessToken dalam apiClient.ts). Membolehkan sebarang
// refresh yang sedang berjalan mengesan bahawa sesi sudah berubah di bawahnya
// (contohnya pengguna log keluar semasa refresh masih menunggu respons
// rangkaian) dan membuang hasilnya dengan senyap dahulu daripada menulis
// token yang lapuk ke atas keadaan yang lebih baharu.
let generation = 0;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return currentToken;
}

export function getSessionGeneration(): number {
  return generation;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
  generation += 1;

  for (const listener of listeners) {
    listener(token);
  }
}

export function subscribeToAccessToken(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
