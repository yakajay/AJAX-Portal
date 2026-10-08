export const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Express 5 forwards rejected promises from async handlers here
export const errorHandler = (err, req, res, next) => {
  if (err.name === 'DocumentNotFoundError') return res.status(404).json({ message: 'Record not found.' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id or value.' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.code === 11000) return res.status(409).json({ message: 'A record with that value already exists.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body.' });

  console.error(err);
  res.status(500).json({ message: 'Internal server error.' });
};
