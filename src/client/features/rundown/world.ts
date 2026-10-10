// The holo city's fixture: over the mission table, built with the rest of the floor and hidden until
// it's brought up (index.ts). Its meshes (city.ts), and a stand-in box per district that the aim lands
// on (an undrawn material: it costs no draw), since the city's own light is never in the aim's way. Its
// words are callouts over the view (labels.ts), made by index.ts.
import * as THREE from 'three';
import { MISSION_TABLE } from '../../../shared/layout';
import type { Fixture } from '../../world/office/fixture';
import type { Interactable } from '../../world/types';
import { cityMeshes, type CityMeshes } from './city';
import { CITY, type District } from './logic';

export interface RundownHolo {
  root: THREE.Group;
  city: CityMeshes;
  /** Puts a stand-in over each district; what each one is, to use. */
  standIns(districts: readonly District[], tops: Map<string, number>): (Interactable & { partId: string })[];
}

declare module '../../world/types' {
  interface OfficeHandles {
    /** The project's map as a city of light over the mission table (features/rundown). */
    rundownHolo: RundownHolo;
  }
}

export const rundownHolo: Fixture<'rundownHolo'> = (site) => {
  const root = new THREE.Group();
  root.name = 'rundown-holo';
  root.position.set(MISSION_TABLE.x, MISSION_TABLE.h, MISSION_TABLE.z);
  root.visible = false;
  const city = cityMeshes();
  const picks = new THREE.Group();
  root.add(city.group, picks);
  const undrawn = new THREE.MeshBasicMaterial({ visible: false });
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  site.group.add(root);
  return {
    handle: {
      rundownHolo: {
        root,
        city,
        standIns(districts, tops) {
          picks.clear();
          return districts.map((d) => {
            const it = { kind: 'rundown' as const, x: MISSION_TABLE.x + d.x, z: MISSION_TABLE.z + d.z, radius: 0.8, partId: d.id };
            const box = new THREE.Mesh(unit, undrawn);
            // From the plane the city stands on to its tallest tower (tops count from the tabletop).
            box.scale.set(d.w, Math.max(0.12, (tops.get(d.id) ?? CITY.lift) - CITY.lift + 0.05), d.d);
            box.position.set(d.x, CITY.lift, d.z);
            box.userData.interact = it;
            picks.add(box);
            return it;
          });
        },
      },
    },
  };
};
