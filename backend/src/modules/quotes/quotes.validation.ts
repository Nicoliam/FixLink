/**
 * FixLink Stage 6C — provider quote validation.
 *
 * Server-side validation is authoritative; Angular validation is UX only.
 * Fields the frontend must never control (quote owner, job status,
 * timestamps, derived item totals) are not accepted here at all.
 */
import type { CreateQuoteInput } from './quotes.types';

export const QUOTE_TOTAL_MAX = 9999999999.99;
export const QUOTE_MESSAGE_MAX = 2000;
export const QUOTE_ITEMS_MAX = 50;
export const QUOTE_ITEM_DESCRIPTION_MAX = 255;
export const QUOTE_ITEM_QTY_MAX = 99999999.99;

export interface ValidatedCreateQuote {
  input: CreateQuoteInput | null;
  error: { status: number; code: string; message: string } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value.trim());
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Validate a POST /api/v1/jobs/:jobId/quotes body. */
export function validateCreateQuote(body: unknown): ValidatedCreateQuote {
  const invalid = (status: number, message: string): ValidatedCreateQuote => ({
    input: null,
    error: { status, code: 'VALIDATION_ERROR', message },
  });
  if (!isRecord(body)) return invalid(422, 'Invalid quote. Please check the form and try again.');

  const total = toFiniteNumber(body['total']);
  if (total === null || total < 0 || total > QUOTE_TOTAL_MAX) {
    return invalid(422, 'Quote amount must be a number between 0 and 9 999 999 999.99.');
  }

  const rawCurrency = body['currency'];
  let currency = 'ZAR';
  if (rawCurrency !== undefined && rawCurrency !== null && String(rawCurrency).trim() !== '') {
    if (typeof rawCurrency !== 'string' || !/^[A-Za-z]{3}$/.test(rawCurrency.trim())) {
      return invalid(422, 'Currency must be ZAR.');
    }
    currency = rawCurrency.trim().toUpperCase();
    if (currency !== 'ZAR') return invalid(422, 'Currency must be ZAR.');
  }

  const rawMessage = body['message'] ?? body['description'] ?? body['note'];
  let message: string | null = null;
  if (rawMessage !== undefined && rawMessage !== null && String(rawMessage).trim() !== '') {
    if (typeof rawMessage !== 'string') return invalid(422, 'Quote message must be text.');
    const trimmed = rawMessage.trim();
    if (trimmed.length > QUOTE_MESSAGE_MAX) {
      return invalid(422, `Quote message must be ${QUOTE_MESSAGE_MAX} characters or fewer.`);
    }
    message = trimmed;
  }

  const rawItems = body['items'] ?? body['quoteItems'] ?? body['quote_items'];
  const items: CreateQuoteInput['items'] = [];
  if (rawItems !== undefined && rawItems !== null) {
    if (!Array.isArray(rawItems)) return invalid(422, 'Quote items must be a list.');
    if (rawItems.length > QUOTE_ITEMS_MAX) {
      return invalid(422, `A quote may have at most ${QUOTE_ITEMS_MAX} line items.`);
    }
    for (let index = 0; index < rawItems.length; index += 1) {
      const raw = rawItems[index];
      if (!isRecord(raw)) return invalid(422, `Quote item ${index + 1} is invalid.`);
      const description = typeof raw['description'] === 'string' ? raw['description'].trim() : '';
      if (description.length < 1 || description.length > QUOTE_ITEM_DESCRIPTION_MAX) {
        return invalid(
          422,
          `Quote item ${index + 1} needs a description of 1–${QUOTE_ITEM_DESCRIPTION_MAX} characters.`,
        );
      }
      const quantity = toFiniteNumber(raw['quantity'] ?? 1);
      if (quantity === null || quantity <= 0 || quantity > QUOTE_ITEM_QTY_MAX) {
        return invalid(422, `Quote item ${index + 1} needs a quantity greater than 0.`);
      }
      const unitPrice = toFiniteNumber(raw['unitPrice'] ?? raw['unit_price']);
      if (unitPrice === null || unitPrice < 0 || unitPrice > QUOTE_TOTAL_MAX) {
        return invalid(422, `Quote item ${index + 1} needs a unit price of 0 or more.`);
      }
      items.push({ description, quantity: roundMoney(quantity), unitPrice: roundMoney(unitPrice) });
    }
  }

  if (items.length > 0) {
    const derivedTotal = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    if (derivedTotal !== roundMoney(total)) {
      return invalid(422, 'Quote total must equal the sum of its line items.');
    }
  }

  return {
    input: { total: roundMoney(total), currency, message, items },
    error: null,
  };
}
