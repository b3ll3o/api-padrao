import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().default(
    'superSecretKeyThatShouldBeInEnvironmentVariables',
  ), // Default for now to avoid breaking if not set, but should be required in prod
  JWT_EXPIRES_IN: Joi.string().default('60s'),
});
