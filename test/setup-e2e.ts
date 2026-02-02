/* eslint-disable no-undef */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carrega as variáveis de ambiente do arquivo .env.test
dotenv.config({ path: path.join(__dirname, '../.env.test') });
