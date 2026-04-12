exports.getPagination = (query = {}) => {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(query.limit || 12)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};
