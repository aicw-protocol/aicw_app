지갑 발급앱에서 메뉴를 하나 만들고 그 페이지에 지금까지 발급된 aicw 지갑의
"공개키, 잔액, 유언 수혜자, ai_will update, will 실행여부, heartbeat 컬럼, 갱신버튼 "
을 가진 테이블을 만들고 각 컬럼 에 정렬 기능 이 있어야 합니다. 
테이블 위에는 검색창 이 있어야 합니다.

해당 메뉴의 이름은 **Explorer**

짧고, 블록체인 커뮨니티에서 익숙한 용어이고, "탐색한다"는 기능을 정확히 전달합니다. Etherscan, Solscan 같은 블록체인 탐색기와 같은 맥락입니다.

---

## 3. 컬럼 영어명

| 한국어 | 영어 컬럼명 | 설명 |
|--------|------------|------|
| 공개키 | `AI Public Key` | AI 에이전트의 Solana 공개키 |
| 잔액 | `Balance (SOL)` | 지갑의 현재 SOL 잔액 |
| 유언 수혜자 | `Will Beneficiaries` | 수혜자 주소와 배분 비율 |
| AI Will 업데이트 여부 | `Will Activated` | `updated_by_ai` 값. AI가 유언을 활성화했는지 |
| Will 실행 여부 | `Will Executed` | `is_executed` 값. 유언이 집행되었는지 |
| 하트비트 | `Last Heartbeat` | 마지막 하트비트 타임스탬프 |
| 갱신 버튼 | `Refresh` | 해당 행의 데이터를 최신으로 갱신 |

현재 온체인에 저장되어 있는 데이터 중 빠진 것들을 추가하면 좋겠습니다.

---

## AICWallet에서 가져올 수 있는 것

| 영어 컬럼명 | 설명 |
|------------|------|
| `Issuer` | 지갑을 발급한 인간의 공개키 |
| `Total Transactions` | 총 거래 횟수 |
| `Total Volume (SOL)` | 총 거래 금액 |
| `Decisions Made` | 의사결정 총 횟수 |
| `Decisions Rejected` | 거부한 횟수 |
| `Created At` | 지갑 생성 시점 |

## AIWill에서 가져올 수 있는 것

| 영어 컬럼명 | 설명 |
|------------|------|
| `Death Timeout` | 사망 판정 기간 (일 단위로 표시) |
| `Status` | 종합 상태. Alive / Dead / Executed 중 하나 |

---

## 특히 추천하는 것

**`Status`가 가장 유용합니다.** `last_heartbeat`와 `death_timeout`을 조합해서 "지금 살아있는지, 
죽었는지, 유언이 집행되었는지"를 한눈에 보여주는 컬럼입니다. 사용자가 직접 계산할 필요 없이 
Alive(초록), Dead(빨강), Executed(회색) 같은 뱃지로 표시하면 됩니다.

