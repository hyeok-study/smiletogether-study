# 로컬 후속 코드의 검증

기준 커밋과 2026-10-15 로컬 후속 변경의 출처는 manifest에 기록했습니다. 파티션 해시, 이력 조회 경계, 저장 실패 전파를 단위 테스트로 확인합니다.

2026-11-12에 History 서버의 선택한 단위 테스트 8개, Chat 서버 PartitionConfigTest 2개가 통과했습니다. History 서버 전체 test 작업은 external-api.space-server 환경 설정이 없어 컨텍스트 테스트 1개가 실패했습니다. 실제 범위를 결과 JSON에 기록했습니다.

```sh
python3 scripts/prepare.py
# JDK 21, Gradle 8.10.2 (원본 wrapper jar가 추적되지 않아 설치된 Gradle 사용)
gradle -p checkout/backend/history-server -I "$PWD/scripts/coverage.init.gradle" test --tests '*HistoryReadBoundaryTest' --tests '*KafkaStorageBoundaryTest' --tests '*KafkaLagCheckerTest'
gradle -p checkout/backend/chat-server test --tests '*PartitionConfigTest'
```

JaCoCo 지표는 선택한 History 서버 단위 테스트의 범위이며 다른 마이크로서비스를 포함하지 않습니다. null 프로필 캐시 변경과 통합 지연 측정은 별도 학습 PR에서 기록합니다.

`compose.lab.yml`은 루프백 포트와 합성 데이터 전용 환경입니다. Mongo의 enableTestCommands는 실패 주입 검증을 위한 설정입니다.
