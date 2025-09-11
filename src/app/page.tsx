"use client";

export default function Home() {
  async function startCheckout() {
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proId: "test-user-123",        // <--- ici ton proId temporaire
        priceId: "prod_T2FUkZhZurtGPy", // <--- remplace par ton vrai ID Stripe
      }),
    });

    const data = await res.json();

    if (data?.url) {
      window.location.href = data.url; // redirection vers Stripe
    } else {
      alert("Erreur: " + (data?.error ?? "Impossible de créer la session"));
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <button onClick={startCheckout}>
        Payer avec Stripe
      </button>
    </main>
  );
}
