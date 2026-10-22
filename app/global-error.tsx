"use client";

// Poslednja linija odbrane: greška u root layout-u. Mora da ima svoj <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Sova trenutno ne radi</h1>
        <p style={{ color: "#555", fontSize: 14 }}>
          Nešto je puklo pri učitavanju aplikacije. Pokušaj ponovo za koji trenutak.
        </p>
        {error.digest && <p style={{ color: "#999", fontSize: 12 }}>Kod greške: {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: 16, padding: "8px 16px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer" }}
        >
          Pokušaj ponovo
        </button>
      </body>
    </html>
  );
}
