// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // Stripe nécessite Node.js

// --- Clients externes (server-side) ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);

// Utilitaire pour renvoyer une réponse JSON propre
function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // 1) Récupération et validation de la signature Stripe
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature" }, 400);

  // Corps brut (pas de JSON.parse ici !)
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return json({ error: `Invalid signature: ${err?.message}` }, 400);
  }

  // 2) Routage des événements
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // L'utilisateur a payé : on active ce qu'il faut
        const session = event.data.object as Stripe.Checkout.Session;

        // Optionnel : récupérer plus d'infos (line items, abo, customer)
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price.product", "subscription", "customer"],
        });

        // Récupération des infos utiles
        const userId =
          fullSession.client_reference_id ||
          (fullSession.metadata?.user_id as string | undefined); // selon comment tu passes l’info lors de la création de la session

        // Email (si tu en as besoin)
        const email =
          fullSession.customer_details?.email ||
          (typeof fullSession.customer !== "string"
            ? (fullSession.customer as Stripe.Customer | null)?.email ?? undefined
            : undefined);

        // Abonnement Stripe (si tu utilises des abonnements)
        const subscriptionId =
          typeof fullSession.subscription === "string"
            ? (fullSession.subscription as string)
            : (fullSession.subscription as Stripe.Subscription | null)?.id;

        // Price/Product du 1er article (si tu en as)
        const firstItem =
          (fullSession as any)?.line_items?.data?.[0] ??
          (fullSession as any)?.line_items?.data?.[0]; // garde simple
        const priceId = firstItem?.price?.id as string | undefined;
        const productId = firstItem?.price?.product?.id as string | undefined;

        // Si abonnement, on peut récupérer plus d'infos (dates de période, status…)
        let currentPeriodEndISO: string | null = null;
        let subscriptionStatus: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = sub.status;
          currentPeriodEndISO = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
        }

        // 3) --- LOGIQUE MÉTIER / PERSISTENCE ---
        // Exemple Supabase : upsert dans une table "subscriptions"
        // Adapte les noms de tables/colonnes à ton schéma !
        if (userId) {
          // Exemple : table "subscriptions"
          await supabase
            .from("subscriptions")
            .upsert(
              {
                user_id: userId,
                stripe_subscription_id: subscriptionId ?? null,
                status: subscriptionStatus ?? "active", // si paiement one-shot, garde "active" ou "paid"
                price_id: priceId ?? null,
                product_id: productId ?? null,
                current_period_end: currentPeriodEndISO,
                customer_email: email ?? null,
                stripe_checkout_session_id: fullSession.id,
              },
              { onConflict: "stripe_checkout_session_id" } // ou "stripe_subscription_id", selon ton unique key
            );

          // (Optionnel) Table "profiles" : activer un flag
          // await supabase.from("profiles").update({ is_active: true }).eq("id", userId);
        } else {
          console.warn(
            "[webhook] checkout.session.completed reçu SANS userId (client_reference_id ou metadata.user_id manquant)."
          );
        }

        // (Optionnel) : email de confirmation, log, etc.

        return json({ received: true }, 200);
      }

      // Tu pourras gérer d'autres cas ici si besoin
      // case "invoice.paid": { ... }
      // case "customer.subscription.deleted": { ... }

      default:
        // On ignore les autres événements
        return json({ received: true, ignored: event.type }, 200);
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    // Stripe réessaie automatiquement si 4xx/5xx.
    // 200 avec un message d’erreur custom si tu veux “absorber” l’erreur.
    return json({ error: err?.message ?? "handler error" }, 500);
  }
}
