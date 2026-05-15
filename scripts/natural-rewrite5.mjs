import { readFileSync, writeFileSync } from 'fs';

const blogDir = 'src/content/blog';

const additions5 = {
  'hoes-mad-뜻-어원-간단-의미-정리.md': `
SNS에서 밈을 접하다 보면 뜻도 모르고 따라 쓰는 경우가 많다. 나중에 어원을 알고 당황하는 것보다 미리 알아두는 게 낫고, 알고 나서 쓸지 말지는 각자가 판단하면 된다.`,

  '기믹-뜻-기믹-래퍼-힙합-다른-분야-기믹이란-3줄-요약.md': `
힙합을 좋아하는 분들이라면 기믹이라는 단어를 자연스럽게 쓰게 된다. 어떤 아티스트를 평가할 때 핵심 표현 중 하나가 기믹이기 때문에 알아두면 대화에서 바로 쓸 수 있다.`,

  '뉴진스-ETA-뜻-또다른-해석.md': `
뉴진스의 노래를 통해 자연스럽게 영어 표현을 접하는 게 재밌는 경험이었다. 이 표현 말고도 가사에 영어 단어가 많이 나오니까 들을 때 가사를 같이 보면 더 즐길 수 있다.`,

  '데포르메-뜻-영어-의미-미술용어.md': `
데포르메라는 용어를 알면 그림 관련 대화에서 더 정확하게 표현할 수 있다. SD, 치비, 데포르메를 구분해서 쓸 수 있다면 그림 문화에 대한 이해가 있는 사람처럼 소통이 된다.`,

  '레게노-무슨-뜻-유래-뜻-3줄-요약.md': `
커뮤니티 언어는 계속 변하기 때문에 지금 쓰이는 표현도 시간이 지나면 구식이 되는 경우가 있다. 레게노가 얼마나 오래 쓰일지는 모르지만, 지금 자주 보인다면 알아두는 게 낫다.`,

  '비틱-뜻-간략-설명-그리고-유래.md': `
야민정음 표현들이 계속 나오는 이유는 커뮤니티 안에서 재미를 공유하는 방식이기 때문이다. 밖에서 보면 이상해 보여도 안에서는 자연스럽게 쓰이는 문화다.`,

  '유튜브-자막-단축키-크기불투명도.md': `
유튜브를 자주 본다면 단축키 하나씩 익혀두는 게 결국 시간을 절약해준다. C키부터 시작해서 조금씩 늘려가면 어느 순간 자연스럽게 키보드로 영상을 조작하는 자신을 발견할 수 있다. 마우스를 덜 쓰게 되는 것만으로도 편의성이 달라진다.`,

  '이니시에이팅아니시에이팅-뜻-간단-정리.md': `
팀 게임에서 용어를 아는 것만으로도 팀원들과 소통이 훨씬 빨라진다. 이니시에이팅, 피딩, 로밍 같은 기본 용어들을 알면 짧은 채팅으로도 상황을 공유할 수 있다. 게임 용어 공부가 실력 향상에 생각보다 도움이 된다.`,

  '가슴이-뻐렁치다-뜻-유래-영상-있음.md': `
이 표현은 한 번 들으면 잊기 어렵다. 상황에 딱 맞는 표현이라는 걸 알게 되면 어느 순간 자연스럽게 쓰게 된다.`,

  '이케아-아이키아-IKEA-원래-발음-무엇-미국-발음.md': `
이케아 관련해서 검색할 때는 이케아, 아이키아 둘 다 검색해보면 더 많은 후기를 볼 수 있다. 표기가 다르다 보니 정보가 나뉘어 있는 경우가 있다.`,
};

let ok = 0, ng = 0;
for (const [filename, addition] of Object.entries(additions5)) {
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
