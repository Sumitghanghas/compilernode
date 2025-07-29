import java.util.Scanner;

public class Main1753766165643 {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int sum = 0;

        // Loop to take input for 10 numbers
        for (int i = 1; i <= 10; i++) {
            System.out.print("Enter number " + i + ": ");
            int num = scanner.nextInt();
            sum += num; // Add to sum
        }

        // Display total sum
        System.out.println("The total sum is: " + sum);
        scanner.close();
    }
}