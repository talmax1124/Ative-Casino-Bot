import { ApiResponse, Client, Environment, CreatePaymentRequest, Payment } from 'squareup';

// Initialize Square client
const squareClient = new Client({
  accessToken: process.env.REACT_APP_SQUARE_ACCESS_TOKEN,
  environment: process.env.REACT_APP_ENVIRONMENT === 'production' 
    ? Environment.Production 
    : Environment.Sandbox
});

export interface PaymentData {
  amount: number; // Amount in cents
  currency: string;
  sourceId: string; // Payment method token
  locationId: string;
  idempotencyKey: string;
  orderId?: string;
  note?: string;
}

export interface SquarePaymentResponse {
  success: boolean;
  payment?: Payment;
  error?: string;
  transactionId?: string;
}

export class SquarePaymentService {
  private paymentsApi = squareClient.paymentsApi;
  private ordersApi = squareClient.ordersApi;

  /**
   * Create a payment with Square
   */
  async createPayment(paymentData: PaymentData): Promise<SquarePaymentResponse> {
    try {
      const request: CreatePaymentRequest = {
        sourceId: paymentData.sourceId,
        idempotencyKey: paymentData.idempotencyKey,
        amountMoney: {
          amount: BigInt(paymentData.amount),
          currency: paymentData.currency
        },
        locationId: paymentData.locationId,
        orderId: paymentData.orderId,
        note: paymentData.note,
        acceptPartialAuthorization: false,
        autocomplete: true
      };

      const response: ApiResponse<any> = await this.paymentsApi.createPayment(request);

      if (response.result && response.result.payment) {
        return {
          success: true,
          payment: response.result.payment,
          transactionId: response.result.payment.id
        };
      } else {
        return {
          success: false,
          error: 'Payment creation failed'
        };
      }
    } catch (error: any) {
      console.error('Square payment error:', error);
      
      let errorMessage = 'Payment processing failed';
      if (error.errors && error.errors.length > 0) {
        errorMessage = error.errors[0].detail || error.errors[0].code;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Generate a unique idempotency key
   */
  generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert dollars to cents
   */
  dollarsToCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  /**
   * Convert cents to dollars
   */
  centsToDollars(cents: number): number {
    return cents / 100;
  }

  /**
   * Validate payment amount
   */
  validateAmount(amountInCents: number): boolean {
    // Square minimum is $0.01 and maximum varies by region
    const minAmount = 1; // 1 cent
    const maxAmount = 500000; // $5,000 (adjust as needed)
    
    return amountInCents >= minAmount && amountInCents <= maxAmount;
  }
}

// Export singleton instance
export const squarePaymentService = new SquarePaymentService();