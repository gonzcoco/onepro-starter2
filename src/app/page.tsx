"use client";
export default function Page() {
  const pay = async () => {
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proId: "test-user-123",
        mode: "payment", // ou "subscription" si ton PRICE_ID est récurrent
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Erreur: ${data?.error || "Unknown"}`);
      return;
    }
    window.location.href = data.url;
  };

  return <button onClick={pay}>Payer avec Stripe</button>;
}
