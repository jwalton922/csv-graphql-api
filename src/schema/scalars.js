const { GraphQLScalarType, Kind } = require('graphql');

const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type (YYYY-MM-DD format)',
  serialize(value) {
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
  parseValue(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date value');
      }
      return date;
    }
    throw new Error('Date scalar must be a string or number');
  },
  parseLiteral(ast) {
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

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type (ISO 8601 format)',
  serialize(value) {
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
  parseValue(value) {
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid datetime value');
      }
      return date;
    }
    throw new Error('DateTime scalar must be a string or number');
  },
  parseLiteral(ast) {
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

module.exports = { DateScalar, DateTimeScalar };