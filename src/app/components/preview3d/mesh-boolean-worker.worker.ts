import { SpellTracker } from '../../utils/Object-Generation';
/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const spellTracker = new SpellTracker(data.editorData, data.modulesList);
  console.log(spellTracker);
  const response = `worker response to ${data}`;
  postMessage(response);
});
