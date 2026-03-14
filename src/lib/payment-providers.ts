// Payment provider abstraction layer
// Supports Paystack, Flutterwave, and mock mode

export interface PaymentInitParams {
  amount: number; // in minor units (kobo/pesewas)
  email: string;
  name: string;
  reference: string;
  currency: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentInitResult {
  checkoutUrl: string;
  reference: string;
  provider: string;
}

export interface PaymentProvider {
  name: string;
  initializePayment(params: PaymentInitParams): Promise<PaymentInitResult>;
}

// Mock provider for demo/testing
export class MockPaymentProvider implements PaymentProvider {
  name = "mock";

  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    // Simulate gateway delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      checkoutUrl: `#mock-payment?ref=${params.reference}&amount=${params.amount}`,
      reference: params.reference,
      provider: "mock",
    };
  }
}

// Paystack provider placeholder
export class PaystackProvider implements PaymentProvider {
  name = "paystack";
  private publicKey: string;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    // In production, this would call Paystack's API or use their inline JS
    // For now, return a structured placeholder
    return {
      checkoutUrl: `https://checkout.paystack.com/pay?key=${this.publicKey}&email=${params.email}&amount=${params.amount}&ref=${params.reference}`,
      reference: params.reference,
      provider: "paystack",
    };
  }
}

// Flutterwave provider placeholder
export class FlutterwaveProvider implements PaymentProvider {
  name = "flutterwave";
  private publicKey: string;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    return {
      checkoutUrl: `https://checkout.flutterwave.com/v3?public_key=${this.publicKey}&tx_ref=${params.reference}&amount=${params.amount / 100}`,
      reference: params.reference,
      provider: "flutterwave",
    };
  }
}

export function getPaymentProvider(
  provider: string,
  publicKey?: string
): PaymentProvider {
  switch (provider) {
    case "paystack":
      return new PaystackProvider(publicKey || "");
    case "flutterwave":
      return new FlutterwaveProvider(publicKey || "");
    default:
      return new MockPaymentProvider();
  }
}

export function generatePaymentReference(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `SS-${ts}-${rand}`.toUpperCase();
}
