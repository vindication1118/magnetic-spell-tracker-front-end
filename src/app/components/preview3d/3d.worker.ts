import { SpellTracker } from '../../utils/Object-Generation';

/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const myTracker = new SpellTracker(data['eD'], data['mL']);
  myTracker
    .addBaseLayer1()
    .then((mesh) => mesh.toJSON())
    .then((meshJSON) => {
      postMessage(meshJSON);
    });

  myTracker.createLayer2().then((meshArray) => {
    for (const mesh of meshArray) {
      const meshJSON = mesh.toJSON();
      postMessage(meshJSON);
    }
  });
  /*myTracker
    .createLayer3()
    .then((mesh) => mesh.toJSON())
    .then((meshJSON) => {
      postMessage(meshJSON);
    });*/
});
