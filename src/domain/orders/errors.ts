export class OrderDomainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ActiveOrderNotFoundError extends OrderDomainError {}

export class OrderItemNotFoundError extends OrderDomainError {}

export class EmptyOrderFinalizeError extends OrderDomainError {}

export class InvalidOrderQuantityError extends OrderDomainError {}

export class InvalidOrderProductError extends OrderDomainError {}
