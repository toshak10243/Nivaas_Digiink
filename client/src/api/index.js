/* global __DEMO__ */
import { realApi } from './real.js';
import { demoApi } from './demo.js';

export const api = __DEMO__ ? demoApi : realApi;
