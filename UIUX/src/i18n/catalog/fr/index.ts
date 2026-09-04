/**
 * French catalogue, assembled from one file per screen cluster.
 * Add a key to your cluster's file only — never to another agent's.
 */
import { core } from './core';
import { care } from './care';
import { enrol } from './enrol';
import { imaging } from './imaging';
import { doctor } from './doctor';
import { meds } from './meds';
import { tasks } from './tasks';
import { diagnostics } from './diagnostics';
import { chat } from './chat';
import { messaging } from './messaging';
import { billing } from './billing';
import { docs } from './docs';
import { records } from './records';

export const fr = {
  ...core,
  care,
  enrol,
  imaging,
  doctor,
  meds,
  tasks,
  diagnostics,
  chat,
  messaging,
  billing,
  docs,
  records,
} as const;
