// Which vehicle to drive: the pink GMC "Jood" or the Tripo flower-truck van.
// Chosen on the home or AR intro screen; ?car=van|gmc in the URL overrides it.
export const VEHICLES={
  gmc:{config:'vehicle.json',label:'جود · الجمس'},
  van:{config:'vehicle-flowertruck.json',label:'شاحنة الورد'},
};
const KEY='jood-vehicle';
export function vehicleChoice() {
  const q=new URLSearchParams(location.search).get('car');if(q&&VEHICLES[q])return q;
  try{const s=localStorage.getItem(KEY);if(VEHICLES[s])return s;}catch{}
  return 'gmc';
}
// Buttons with data-car inside `root`; picking another vehicle reloads the page.
export function mountVehiclePicker(root) {
  if(!root)return;const current=vehicleChoice();
  for(const b of root.querySelectorAll('[data-car]')){
    b.setAttribute('aria-pressed',String(b.dataset.car===current));
    b.addEventListener('click',()=>{
      if(b.dataset.car===current)return;
      try{localStorage.setItem(KEY,b.dataset.car);}catch{}
      const url=new URL(location.href);url.searchParams.delete('car');location.replace(url.href);
    });
  }
}
