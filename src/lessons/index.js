// The seven core lessons, easy to hard; PRODUCT.md owns the curriculum. Each module's default export is one lesson; see lesson-1.js.
import l1 from './lesson-1.js';
import l2 from './lesson-2.js';
import l3 from './lesson-3.js';
import l4 from './lesson-4.js';
import l5 from './lesson-5.js';
import l6 from './lesson-6.js';
import l7 from './lesson-7.js';

export const LESSONS = [l1, l2, l3, l4, l5, l6, l7];

// The track after the core lessons: shown in the drawer, disabled, not counted in progress.
export const NEXT_TRACK = { title: 'Dimensional modeling' };
