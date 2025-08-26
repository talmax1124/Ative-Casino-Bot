declare module 'squareup' {
  export enum Environment {
    Sandbox = 'sandbox',
    Production = 'production'
  }

  export interface CreatePaymentRequest {
    sourceId: string;
    amountMoney: {
      amount: bigint;
      currency: string;
    };
    locationId?: string;
    idempotencyKey?: string;
  }

  export interface Payment {
    id?: string;
    status?: string;
    amountMoney?: {
      amount: bigint;
      currency: string;
    };
  }

  export interface ApiResponse<T> {
    result?: T;
    errors?: any[];
  }

  export interface ClientConfig {
    accessToken: string;
    environment: Environment;
  }

  export class Client {
    constructor(config: ClientConfig);
    paymentsApi: {
      createPayment(request: CreatePaymentRequest): Promise<ApiResponse<{payment: Payment}>>;
    };
  }
}