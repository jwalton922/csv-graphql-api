import { GraphQLScalarType, Kind } from 'graphql';

export const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type (YYYY-MM-DD format)',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    } else if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value');
      }
      return date.toISOString().split('T')[0];
    }
    throw new Error('Date scalar must be a Date instance or a valid date string/number');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value');
      }
      return date;
    }
    throw new Error('Date scalar must be a string or number');
  },
  parseLiteral(ast): Date | null {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value');
      }
      return date;
    }
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  },
});

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type (ISO 8601 format)',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    } else if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid datetime value');
      }
      return date.toISOString();
    }
    throw new Error('DateTime scalar must be a Date instance or a valid datetime string/number');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid datetime value');
      }
      return date;
    }
    throw new Error('DateTime scalar must be a string or number');
  },
  parseLiteral(ast): Date | null {
    if (ast.kind === Kind.STRING) {
      const date = new Date(ast.value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid datetime value');
      }
      return date;
    }
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10));
    }
    return null;
  },
});