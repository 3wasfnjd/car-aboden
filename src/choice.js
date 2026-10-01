// The flower-truck van is the car. The GMC stays only for the hidden driving
// lab and its tests (?car=gmc).
export const VEHICLES={
  gmc:{config:'vehicle.json',label:'جود · الجمس'},
  van:{config:'vehicle-flowertruck.json',label:'شاحنة الورد'},
};
export function vehicleChoice() {
  const q=new URLSearchParams(location.search).get('car');
  return q&&VEHICLES[q]?q:'van';
}
