// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE! // service_role
);

function json(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // 1) Vérif signature Stripe
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature" }, 400);

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

  // 2) Routage
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // proId tel qu'envoyé lors de la création de la session
        const proId =
          (session.client_reference_id as string | undefined) ||
          (session.metadata?.pro_id as string | undefined);

        const planType = session.metadata?.plan_type ?? "starter";
        const planTier = session.metadata?.plan_tier ?? "basic";
        const earlyMinutes = Number(session.metadata?.early_minutes ?? 15);

        let channels: any = null;
        if (session.metadata?.channels) {
          try {
            channels = JSON.parse(session.metadata.channels);
          } catch {
            channels = session.metadata.channels;
          }
        }

        // Si ce n'est pas un abonnement, garde au moins l'id de session
        const stripe_subscription =
          typeof session.subscription === "string"
            ? session.subscription
            : session.id;

        if (!proId) {
          console.warn("[webhook] pas de pro_id / client_reference_id -> skip");
          return json({ received: true, skipped: "no pro_id" }, 200);
        }

        // 👉 Upsert STRICTEMENT sur les colonnes existantes de ta table
        const { error } = await supabase
          .from("subscriptions")
          .upsert(
            {
              pro_id: proId,
              plan_type: planType,
              plan_tier: planTier,
              early_minutes: earlyMinutes,
              channels,
              stripe_subscription,
            },
            { onConflict: "pro_id" } // nécessite un index unique sur pro_id
          );

        if (error) {
          console.error("Supabase upsert error:", error);
          return json({ error: "DB error", details: error.message }, 500);
        }

        return json({ received: true }, 200);
      }

      default:
        return json({ received: true, ignored: event.type }, 200);
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return json({ error: err?.message ?? "handler error" }, 500);
  }
}
