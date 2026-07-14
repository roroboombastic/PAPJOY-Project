const Joi = require('joi');

function validate(schema) {
  return (req, res, next) => {
    const options = { abortEarly: false, allowUnknown: false, stripUnknown: true };
    const body = req.body || {};
    const { error, value } = schema.validate(body, options);
    if (error) {
      return res.status(400).json({ error: error.details.map((detail) => detail.message).join(', ') });
    }
    req.body = value;
    next();
  };
}

module.exports = { validate, Joi };
