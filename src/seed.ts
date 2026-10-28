import {seed} from './postgres-db.js';
await seed();console.log('Usuários e artigos de suporte sincronizados no PostgreSQL.');
