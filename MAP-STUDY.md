# 요청 내 프로필 재사용 개선

채팅 이력을 응답으로 만들 때 같은 발신자의 프로필을 다시 조회하는 부분을 살펴봤습니다. 2026-10-15 로컬 변경의 computeIfAbsent는 정상 프로필을 재사용하지만 null 결과는 저장하지 않았습니다. 이번에는 containsKey로 조회 여부와 반환값을 구분하도록 바꿨습니다.

Map은 메서드 안에서 생성하고 메시지를 순차 처리합니다. 요청 사이에 공유하지 않으므로 HashMap을 사용했습니다. 정상 프로필은 발신자별로 한 번 조회하고, null 응답도 그 요청 안에서 재사용합니다. 다음 요청에서는 다시 조회합니다.

## 검증

2026-11-12에 기존 computeIfAbsent 구현으로 null 결과 회귀 테스트가 실패하는 것을 확인했습니다. 변경 후 해당 테스트와 정상 프로필·복수 발신자·요청 간 분리 테스트가 통과했습니다. History 선택 단위 테스트는 10개, Chat 파티션 테스트는 2개, 로컬 Kafka/Mongo 통합 테스트는 4개가 통과했습니다. 전체 서버 설정을 포함한 컨텍스트 테스트와는 범위를 구분합니다.

단위 테스트의 Mockito 호출 횟수로 null 결과가 한 번만 조회되는지 확인하고, 응답에 메시지 2개가 남는지 검사했습니다. 실제 HTTP 오류나 예외 전부를 같은 동작으로 보장하는 테스트는 아닙니다.

## 로컬 지연 측정

| 조건 | 값 |
|---|---|
| 대상 | Mongo 이력 조회와 프로필 HTTP 호출을 포함한 getChannelMessages 메서드 |
| 데이터 | 메시지 20개, 서로 다른 발신자 4명 |
| 프로필 서버 | 합성 프로필, 응답 전 2ms 대기 |
| 반복 | 각 방식 워밍업 5회, 5라운드 × 20회, 라운드마다 실행 순서 교대 |
| 환경 | macOS ARM64, JDK 21.0.6, Gradle 8.10.2, Mongo 7.0, Kafka 3.9.0 |

원본의 메시지별 프로필 조회와 요청 내 캐시가 있는 현재 구현을 비교했습니다. 정상 프로필에서 computeIfAbsent와 containsKey를 비교한 실험은 아닙니다.

| 지표 | 메시지별 조회 | 요청 내 재사용 |
|---|---:|---:|
| 이력 조회 횟수 | 100 | 100 |
| 프로필 HTTP 호출 합계 | 2,000 | 400 |
| 평균 | 64.03ms | 15.22ms |
| p50 | 62.19ms | 14.83ms |
| p95 | 74.58ms | 18.27ms |

원시 표본과 집계 방식은 results/benchmark-controlled.json 및 benchmark-summary.json에 있습니다. 이 수치는 로컬 메서드 호출 측정입니다.

## 재현

```sh
python3 scripts/prepare.py
gradle -p checkout/backend/history-server -I "$PWD/scripts/coverage.init.gradle" test --tests '*ChannelMessageServiceTest' --tests '*HistoryReadBoundaryTest' --tests '*KafkaStorageBoundaryTest' --tests '*KafkaLagCheckerTest'
docker compose -p hyeok-study-lab -f compose.lab.yml up -d
gradle -p checkout/backend/history-server integrationTest -Dlab.phase=after --rerun-tasks
docker compose -p hyeok-study-lab -f compose.lab.yml down
```

AI와 함께 코드와 테스트를 작성하고 기존 방식에서 실패·변경 후 통과를 확인한 개인 학습입니다. 원래 팀 프로젝트의 구현 시점과 성과로 소급하지 않습니다. 관련 이슈: #3.
