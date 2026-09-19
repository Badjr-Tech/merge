const { PrismaClient } = require('@prisma/client');

const base = new PrismaClient();

const LIST_OPS = ['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany'];

// Removed projects (Project.removedAt set) disappear from every list, count, and task query
// automatically. Pass `removedAt: { not: null }` (or any explicit removedAt filter) to see them,
// e.g. the "Removed" list in Settings. findUnique by id is not filtered — routes check removedAt.
const prisma = base.$extends({
  name: 'hideRemovedProjects',
  query: {
    project: {
      async $allOperations({ operation, args, query }) {
        if (LIST_OPS.includes(operation)) {
          const where = (args && args.where) || {};
          if (where.removedAt === undefined) args = { ...args, where: { ...where, removedAt: null } };
        }
        return query(args);
      },
    },
    question: {
      async $allOperations({ operation, args, query }) {
        if (LIST_OPS.includes(operation)) {
          const where = (args && args.where) || {};
          const rel = where.project || {};
          if (rel.removedAt === undefined && !rel.is && !rel.isNot) args = { ...args, where: { ...where, project: { ...rel, removedAt: null } } };
        }
        return query(args);
      },
    },
  },
});

module.exports = prisma;
