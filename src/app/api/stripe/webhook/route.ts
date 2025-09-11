import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs"; // Stripe a besoin du runtime Node
export const dynamic = "force-dynamic"; // (optionnel mais utile en App Router)

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing Stripe signature", { status: 400 });
  }

  const rawBody = await req.text();

  // ✅ Sans apiVersion
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    // TODO: ton traitement (créer user, activer abo, etc.)
  }

  return NextResponse.json({ received: true });
}
