
import { Expose, instanceToPlain } from 'class-transformer';

class TestDto {
  @Expose()
  @Expose({ name: 'store_name' })
  storeName: string;
}

const dto = new TestDto();
dto.storeName = 'Test Store';
console.log(JSON.stringify(instanceToPlain(dto), null, 2));
