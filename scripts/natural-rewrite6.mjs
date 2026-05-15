import { readFileSync, writeFileSync } from 'fs';

const blogDir = 'src/content/blog';

const additions6 = {
  '데포르메-뜻-영어-의미-미술용어.md': `
그림을 그리지 않아도 데포르메를 이해하면 애니메이션이나 게임 캐릭터를 볼 때 다르게 보인다. 어떤 부분이 강조됐고 어떤 부분이 줄었는지가 눈에 들어오기 시작한다.`,

  '레게노-무슨-뜻-유래-뜻-3줄-요약.md': `
레게노 같은 신조어들이 생겨나는 속도가 점점 빠르다. 새 표현이 계속 나오다 보니 따라잡기 힘들 때도 있지만, 자주 쓰이는 건 자연스럽게 접하게 된다. 레게노는 그중 비교적 오래된 편이라 이미 많이 알려진 표현이다.`,

  '유튜브-자막-단축키-크기불투명도.md': `
유튜브 단축키는 처음엔 외우기 귀찮지만 한 번 손에 익으면 마우스를 쓰던 때로 돌아가기 싫어진다. 영상 하나 볼 때마다 조금씩 익혀보면 어느 순간 자연스러워진다.`,

  '이니시에이팅아니시에이팅-뜻-간단-정리.md': `
이니시에이팅을 처음 잘 못해도 계속 하다 보면 감이 온다. 틀린 타이밍에 들어가서 팀이 무너지는 경험을 반복하면서 언제 들어가면 안 되는지를 먼저 배우게 된다.`,
};

let ok = 0, ng = 0;
for (const [filename, addition] of Object.entries(additions6)) {
  const filepath = `${blogDir}/${filename}`;
  const current = readFileSync(filepath, 'utf-8');
  const currentStripped = current.replace(/\s/g, '').length;
  if (currentStripped >= 1500) {
    console.log(`SKIP ${currentStripped}\t${filename.substring(0, 50)}`);
    ok++;
    continue;
  }
  const newContent = current.trimEnd() + '\n\n' + addition.trimStart() + '\n';
  writeFileSync(filepath, newContent, 'utf-8');
  const stripped = newContent.replace(/\s/g, '').length;
  console.log(`${stripped >= 1500 ? 'OK' : 'NG'} ${stripped}\t${filename.substring(0, 50)}`);
  if (stripped >= 1500) ok++; else ng++;
}
console.log(`\n완료: OK ${ok}개, NG ${ng}개`);
