import { generateFixtures } from './generateFixtures.js';

export default async function setup(): Promise<void> {
  await generateFixtures();
}
